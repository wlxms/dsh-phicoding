#!/usr/bin/env node
// META_REF_ACYCLIC_01 - concrete implementation graph is acyclic.
//
// Uses fields/properties (holds) and explicit new (creates), never interface
// references. A decorator holding IA and a state host holding IState do not enter
// this graph. Nested-type-only cycles remain one design unit.
import { runCheck } from '../../model.mjs'
import { checkConcreteAcyclic } from '../../dependency.mjs'

runCheck(checkConcreteAcyclic)
