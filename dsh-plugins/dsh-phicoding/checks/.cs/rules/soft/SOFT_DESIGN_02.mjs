#!/usr/bin/env node
// SOFT_DESIGN_02 - construction boundary.
//
// `new Concrete()` is a separate relation from holding. It is allowed at the
// composition root, in an extension, or at exactly one owner/construction site
// per target. Two independent construction sites for the same concrete type are
// scattered knowledge, not composition.
import { runCheck } from '../../model.mjs'
import { checkConstructionBoundary } from '../../dependency.mjs'

runCheck(checkConstructionBoundary)
