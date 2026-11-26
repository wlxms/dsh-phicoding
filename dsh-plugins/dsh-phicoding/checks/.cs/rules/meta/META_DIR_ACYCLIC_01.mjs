#!/usr/bin/env node
// META_DIR_ACYCLIC_01 - project each reference onto the first divergent file/dir
// unit under its lowest common ancestor; file-file edges belong to the SCC rule.
// The remaining unit graph must be acyclic; the whole graph is checked as one SCC.
import { run } from '../../../layout.mjs'

run('sibling-acyclic')
