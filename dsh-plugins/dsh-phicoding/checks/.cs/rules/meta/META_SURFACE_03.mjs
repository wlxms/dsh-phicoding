#!/usr/bin/env node
// META_SURFACE_03 - module class data needs an interface.
//
// A class data concept owned by the module is a data concept, not a loose
// implementation object: the module must be able to name its contract. PureDTO
// classes are excluded because they are external data and carry no module
// knowledge.
import { runCheck } from '../../model.mjs'
import { checkModuleDataClassHasInterface } from '../../contract.mjs'

runCheck(checkModuleDataClassHasInterface)
