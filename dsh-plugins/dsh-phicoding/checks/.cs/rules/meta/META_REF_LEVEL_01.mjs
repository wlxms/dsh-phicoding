#!/usr/bin/env node
// META_REF_LEVEL_01 - reference degree.
//
// Naming an abstraction sets the ceiling for the rest of that family:
// interface -> interfaces only; abstract -> abstract only; concrete -> no subclass.
// References forced only by a base-class contract are removed from the derived
// baseline and target set before the remaining references are judged.
import { runCheck } from '../../model.mjs'
import { checkReferenceDegree } from '../../dependency.mjs'

runCheck(checkReferenceDegree)
