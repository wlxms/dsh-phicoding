#!/usr/bin/env node
// META_REF_LEVEL_01 - reference degree.
//
// The old 0750 invariant, unchanged: naming an abstraction sets the ceiling for
// the rest of that family. Interface -> interfaces only; abstract -> abstract
// only; concrete -> no subclass.
import { runCheck } from '../../model.mjs'
import { checkReferenceDegree } from '../../dependency.mjs'

runCheck(checkReferenceDegree)
