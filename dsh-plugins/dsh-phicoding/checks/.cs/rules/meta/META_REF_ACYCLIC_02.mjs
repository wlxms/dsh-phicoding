#!/usr/bin/env node
// META_REF_ACYCLIC_02 - struct-involving reference graph is acyclic.
//
// A struct is data (META_DIR_CLASS_04), but that does not remove its references from the
// dependency graph. IA -> struct -> IB -> IA is still a cycle.
import { runCheck } from '../../model.mjs'
import { checkStructReferenceAcyclic } from '../../dependency.mjs'

runCheck(checkStructReferenceAcyclic)
