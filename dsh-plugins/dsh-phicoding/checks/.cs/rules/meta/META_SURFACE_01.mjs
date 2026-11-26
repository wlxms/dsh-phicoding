#!/usr/bin/env node
// META_SURFACE_01 - contract purity.
//
// Interfaces may mention interfaces and pure data only. A concrete or abstract
// behavior class in an interface signature is an implementation detail leaked
// into the public face.
import { runCheck } from '../../model.mjs'
import { checkInterfacePurity } from '../../contract.mjs'

runCheck(checkInterfacePurity)
