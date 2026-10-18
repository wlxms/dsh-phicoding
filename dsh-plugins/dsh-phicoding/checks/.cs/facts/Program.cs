// PhiCoding facts base - C#.
//
// This program parses. It does not judge. Every rule lives in its own script
// under ../, reads the JSON this prints, and decides on its own.
//
// SYNTAX ONLY - the target project is never compiled.
//
// An earlier version built a CSharpCompilation and asked the semantic model what
// each identifier resolved to. That made correctness depend on something a
// checker must not require: that the project compiles. A missing `using`, an
// unfinished method, an external module that is not on this machine, or a
// Windows-only target being edited on Linux - any of those stops resolution, and
// the semantic model then reports NO reference rather than an error. Every
// structural check goes green on code that is merely broken.
//
// It also missed the point: what a rule needs is not "which symbol is this" but
// "what kind of syntactic position is this name in". The syntax tree answers
// that exactly - for code that does not compile, in any environment.
//
//   class Slot { ... }              declaration name        not a reference
//   Dictionary<Slot, Item> worn     type argument           reference
//   public string Slot { get; }     property declarator     not a reference
//   Attributes.Set(k, v)            member access           not a reference
//   Value.Plus(1)                   member access           not a reference
//   Slots.Hand                      bare left of a member   reference
//
// Usage: Facts <source dir>          writes facts JSON to stdout
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

if (args.Length < 1)
{
    Console.Error.WriteLine("usage: Facts <source dir>");
    return 2;
}

var root = Path.GetFullPath(args[0]);
if (!Directory.Exists(root))
{
    Console.Error.WriteLine($"no such directory: {root}");
    return 2;
}

var skip = new HashSet<string> { "bin", "obj", "node_modules", ".git", ".build" };

var files = Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
    .Where(p => !p.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(skip.Contains))
    .OrderBy(p => p, StringComparer.Ordinal)
    .ToList();

// Parse, never compile. No references, no metadata, no build.
var trees = files.Select(f => CSharpSyntaxTree.ParseText(File.ReadAllText(f), path: f)).ToList();
var treeOf = trees.ToDictionary(t => t.FilePath, StringComparer.Ordinal);

var decls = new List<(string File, string Name, BaseTypeDeclarationSyntax Node)>();
foreach (var tree in trees)
{
    foreach (var node in tree.GetRoot().DescendantNodes())
    {
        if (node is not BaseTypeDeclarationSyntax decl) continue;
        decls.Add((tree.FilePath, decl.Identifier.ValueText, decl));
    }
}

var names = decls.Select(d => d.Name).ToHashSet(StringComparer.Ordinal);
var types = new List<object>();
var refs = new List<object>();
var seenRef = new HashSet<string>(StringComparer.Ordinal);

foreach (var fileGroup in decls.GroupBy(d => d.File).OrderBy(g => g.Key, StringComparer.Ordinal))
{
    var tree = treeOf[fileGroup.Key];
    var relative = Path.GetRelativePath(root, fileGroup.Key).Replace('\\', '/');

    var usings = tree.GetRoot().DescendantNodes().OfType<UsingDirectiveSyntax>()
        .Select(u => u.Name?.ToString() ?? "")
        .Where(u => u.Length > 0)
        .Distinct()
        .ToArray();

    foreach (var (_, name, decl) in fileGroup)
    {
        var line = tree.GetLineSpan(decl.Span).StartLinePosition.Line + 1;
        var endLine = tree.GetLineSpan(decl.Span).EndLinePosition.Line + 1;

        var members = new List<object>();
        if (decl is TypeDeclarationSyntax withMembers)
        {
            foreach (var member in withMembers.Members)
            {
                var memberType = member switch
                {
                    BaseFieldDeclarationSyntax field => field.Declaration.Type.ToString(),
                    PropertyDeclarationSyntax property => property.Type.ToString(),
                    MethodDeclarationSyntax method => method.ReturnType.ToString(),
                    EventDeclarationSyntax evt => evt.Type.ToString(),
                    _ => null
                };
                var memberName = member switch
                {
                    MethodDeclarationSyntax method => method.Identifier.ValueText,
                    PropertyDeclarationSyntax property => property.Identifier.ValueText,
                    EventDeclarationSyntax evt => evt.Identifier.ValueText,
                    BaseFieldDeclarationSyntax field => string.Join(", ", field.Declaration.Variables.Select(v => v.Identifier.ValueText)),
                    _ => null
                };
                if (memberName is null) continue;
                members.Add(new
                {
                    name = memberName,
                    kind = member.Kind().ToString().Replace("Declaration", "").ToLowerInvariant(),
                    type = memberType,
                    isStatic = member.Modifiers.Any(SyntaxKind.StaticKeyword),
                    line = tree.GetLineSpan(member.Span).StartLinePosition.Line + 1,
                    // A member's span is what an exemption comment inside it applies to.
                    endLine = tree.GetLineSpan(member.Span).EndLinePosition.Line + 1,
                    // Leading trivia (the comments written directly above the member) is
                    // outside Span but belongs to it. Without this line, a comment
                    // explaining an exemption never covers the member it explains.
                    firstLine = tree.GetLineSpan(member.FullSpan).StartLinePosition.Line + 1
                });
            }
        }
        else if (decl is EnumDeclarationSyntax enumDecl)
        {
            foreach (var member in enumDecl.Members)
            {
                members.Add(new
                {
                    name = member.Identifier.ValueText,
                    kind = "enummember",
                    type = (string?)null,
                    // 枚举成员是枚举的值，不是进程级状态。标成 static 会让
                    // "主干零 static" 在任何一个枚举上重复报一遍 0300 已经报过的事。
                    isStatic = false,
                    line = tree.GetLineSpan(member.Span).StartLinePosition.Line + 1
                });
            }
        }

        var elseLines = new List<int>();
        var switchLines = new List<int>();
        var strings = new List<object>();
        var comments = new List<object>();
        var dispatches = new List<object>();

        foreach (var n in decl.DescendantNodes())
        {
            switch (n)
            {
                case IfStatementSyntax { Else: not null } branch:
                    elseLines.Add(tree.GetLineSpan(branch.Else!.Span).StartLinePosition.Line + 1);
                    break;
                case SwitchStatementSyntax statement:
                    switchLines.Add(tree.GetLineSpan(statement.Span).StartLinePosition.Line + 1);
                    // A string literal in case position is a name doing a type's job.
                    foreach (var label in statement.Sections.SelectMany(section => section.Labels))
                    {
                        if (label is CaseSwitchLabelSyntax label1
                            && label1.Value is LiteralExpressionSyntax caseLiteral
                            && caseLiteral.IsKind(SyntaxKind.StringLiteralExpression))
                        {
                            dispatches.Add(new
                            {
                                kind = "switch",
                                literal = caseLiteral.Token.ValueText,
                                line = tree.GetLineSpan(caseLiteral.Span).StartLinePosition.Line + 1
                            });
                        }
                    }
                    break;
                case SwitchExpressionSyntax expression:
                    switchLines.Add(tree.GetLineSpan(expression.Span).StartLinePosition.Line + 1);
                    foreach (var arm in expression.Arms)
                    {
                        if (arm.Pattern is ConstantPatternSyntax armPattern
                            && armPattern.Expression is LiteralExpressionSyntax armLiteral
                            && armLiteral.IsKind(SyntaxKind.StringLiteralExpression))
                        {
                            dispatches.Add(new
                            {
                                kind = "switch",
                                literal = armLiteral.Token.ValueText,
                                line = tree.GetLineSpan(armLiteral.Span).StartLinePosition.Line + 1
                            });
                        }
                    }
                    break;
                case BinaryExpressionSyntax comparison
                    when comparison.IsKind(SyntaxKind.EqualsExpression) || comparison.IsKind(SyntaxKind.NotEqualsExpression):
                    // x == "name" / "name" != x. The literal is the name; the other side
                    // is whatever we are branching on.
                    foreach (var side in new[] { comparison.Left, comparison.Right })
                    {
                        if (side is not LiteralExpressionSyntax compareLiteral) continue;
                        if (!compareLiteral.IsKind(SyntaxKind.StringLiteralExpression)) continue;
                        dispatches.Add(new
                        {
                            kind = "compare",
                            literal = compareLiteral.Token.ValueText,
                            line = tree.GetLineSpan(compareLiteral.Span).StartLinePosition.Line + 1
                        });
                    }
                    break;
                case IsPatternExpressionSyntax pattern
                    when pattern.Pattern is ConstantPatternSyntax constant
                        && constant.Expression is LiteralExpressionSyntax patternLiteral
                        && patternLiteral.IsKind(SyntaxKind.StringLiteralExpression):
                    dispatches.Add(new
                    {
                        kind = "compare",
                        literal = patternLiteral.Token.ValueText,
                        line = tree.GetLineSpan(patternLiteral.Span).StartLinePosition.Line + 1
                    });
                    break;
                case LiteralExpressionSyntax literal when literal.IsKind(SyntaxKind.StringLiteralExpression):
                    strings.Add(new { value = literal.Token.ValueText, line = tree.GetLineSpan(literal.Span).StartLinePosition.Line + 1 });
                    break;
                case InterpolatedStringTextSyntax text when text.TextToken.ValueText.Trim().Length > 0:
                    strings.Add(new { value = text.TextToken.ValueText, line = tree.GetLineSpan(text.Span).StartLinePosition.Line + 1 });
                    break;
            }
        }

        foreach (var trivia in decl.DescendantTrivia())
        {
            if (!trivia.IsKind(SyntaxKind.SingleLineCommentTrivia) && !trivia.IsKind(SyntaxKind.MultiLineCommentTrivia)) continue;
            var text = trivia.ToString();
            // Comments are structured, not prose: every one parses into fields or
            // reports why it cannot. Rules then read fields instead of re-inventing
            // a regex per rule - and a malformed comment can never pass for a valid one.
            var parsed = ParseComment(text);
            comments.Add(new
            {
                text,
                line = tree.GetLineSpan(trivia.Span).StartLinePosition.Line + 1,
                error = parsed.error,
                fields = parsed.fields
            });
        }

        // A name is a reference when it sits in a type position. The syntax tree
        // says which positions those are, so a member named after a type can no
        // longer pass for one - without a symbol table, and without compiling.
        foreach (var syntax in ReferenceNamesIn(decl))
        {
            var target = RightmostName(syntax);
            if (target is null || target == name || !names.Contains(target)) continue;
            var at = tree.GetLineSpan(syntax.Span).StartLinePosition.Line + 1;
            if (!seenRef.Add($"{name}|{target}|{at}")) continue;
            refs.Add(new { from = name, to = target, file = relative, line = at });
        }

        types.Add(new
        {
            name,
            @namespace = (decl.Parent as BaseNamespaceDeclarationSyntax)?.Name.ToString(),
            kind = decl.Kind().ToString().Replace("Declaration", "").ToLowerInvariant(),
            accessibility = decl.Modifiers.Any(SyntaxKind.PublicKeyword) ? "public" : "internal",
            isAbstract = decl.Modifiers.Any(SyntaxKind.AbstractKeyword),
            isStatic = decl.Modifiers.Any(SyntaxKind.StaticKeyword),
            file = relative,
            line,
            endLine,
            containing = (decl.Parent as TypeDeclarationSyntax)?.Identifier.ValueText,
            @base = decl.BaseList?.Types.FirstOrDefault()?.Type.ToString(),
            interfaces = decl.BaseList?.Types.Skip(1).Select(t => t.Type.ToString()).ToArray() ?? [],
            usings,
            members,
            elseLines,
            switchLines,
            strings,
            dispatches,
            comments
        });
    }
}

var payload = new
{
    language = "cs",
    root,
    mode = "syntax",
    fileCount = files.Count,
    files = files.Select(f => Path.GetRelativePath(root, f).Replace('\\', '/')).ToArray(),
    types,
    references = refs
};

Console.OutputEncoding = Encoding.UTF8;
Console.WriteLine(JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false }));
return 0;

// ---- helpers ---------------------------------------------------------------

// Outermost type positions in a declaration body. A nested TypeSyntax is
// covered by its outer one, so taking only the outermost avoids reporting every
// segment of `Spine.Data.Forge` as a separate name.
static IEnumerable<TypeSyntax> ReferenceNamesIn(SyntaxNode scope)
{
    foreach (var syntax in scope.DescendantNodes().OfType<TypeSyntax>())
    {
        if (syntax.Parent is TypeSyntax) continue;
        // `Slots.Hand` names a member, not a type - but `Slots` on the left is
        // the type being reached through. So only the member name is dropped.
        if (syntax.Parent is MemberAccessExpressionSyntax access && access.Name == syntax) continue;
        yield return syntax;
    }
}

    // 注释的语法：// [作者 日期 key=value ...] 原因
    //
    // 方括号里按空格切：前两项固定是作者与日期，其余只能是 key=value。
    // 方括号外整段是原因——随便写，不需要引号也不需要转义，因为它不再是
    // "某个字段的值"。这是刻意的：可解析的那部分进括号，人话留在外面。
    //
    // 只解析，不判断——"哪些字段是必须的、日期什么形状"归规则，底座不替它拿主意。
    static (string? error, Dictionary<string, string> fields) ParseComment(string raw)
    {
        var fields = new Dictionary<string, string>();
        var body = raw.Trim();
        if (body.StartsWith("/*", StringComparison.Ordinal) && body.EndsWith("*/", StringComparison.Ordinal))
            body = body.Substring(2, body.Length - 4).Trim();
        else if (body.StartsWith("//", StringComparison.Ordinal))
            body = body.Substring(2).Trim();

        if (!body.StartsWith("[", StringComparison.Ordinal))
            return ("注释必须以 [作者 日期] 开头", fields);

        var close = body.IndexOf(']');
        if (close < 0) return ("方括号没有闭合", fields);

        var head = body.Substring(1, close - 1);
        var reason = body.Substring(close + 1).Trim();

        var tokens = head.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length < 2) return ("方括号里至少要「作者 日期」两项", fields);

        fields["author"] = tokens[0];
        fields["date"] = tokens[1];
        if (reason.Length > 0) fields["reason"] = reason;

        for (var i = 2; i < tokens.Length; i++)
        {
            var token = tokens[i];
            var separator = token.IndexOf('=');
            if (separator <= 0) return ($"方括号里的「{token}」不是 key=value", fields);
            var key = token.Substring(0, separator);
            if (fields.ContainsKey(key)) return ($"{key} 重复", fields);
            fields[key] = token.Substring(separator + 1);
        }

        return (null, fields);
    }

    // TypeSyntax covers plain names, generic names and qualified names. For
    // `Spine.Data.Forge` the type is the rightmost segment; the namespace on the
    // left is not a type and must not be reported as one.
    static string? RightmostName(TypeSyntax syntax) => syntax switch
{
    IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
    GenericNameSyntax generic => generic.Identifier.ValueText,
    QualifiedNameSyntax qualified => RightmostName(qualified.Right),
    AliasQualifiedNameSyntax alias => RightmostName(alias.Name),
    NullableTypeSyntax nullable => RightmostName(nullable.ElementType),
    ArrayTypeSyntax array => RightmostName(array.ElementType),
    PointerTypeSyntax pointer => RightmostName(pointer.ElementType),
    PredefinedTypeSyntax => null,
    _ => null
};
