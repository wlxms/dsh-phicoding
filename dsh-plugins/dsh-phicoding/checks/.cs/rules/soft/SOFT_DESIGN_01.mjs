#!/usr/bin/env node
// SOFT_DESIGN_01 - no concrete hold.
//
// A field/property/event is persistent state. It may hold an interface, pure
// data or an external fact; holding a concrete project implementation is the
// leak. Decorators hold IA (interface) and pass; state hosts hold IState
// (interface) and pass.
import { runCheck } from '../../model.mjs'
import { checkNoConcreteHold } from '../../dependency.mjs'

runCheck(checkNoConcreteHold)
