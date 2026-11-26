#!/usr/bin/env node
// META_DIR_CLASS_01 - every strongly connected component of the type reference graph must
// live in one directory. A cycle that spans folders is a directory-level design
// unit and cannot be repaired by changing one edge.
import { run } from '../../../layout.mjs'

run('scc-same-directory')
