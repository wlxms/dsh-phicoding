#!/usr/bin/env node
// META_SURFACE_02 - behavior classes are covered by an interface.
//
// Inside a module every behavior class has a contract. In a project without
// modules the old 0700 invariant still applies to abstract classes; concrete
// classes wait for module adoption (the low-enforcement migration path).
// Data, utilities, extensions, nested details and the composition root are not
// behavior classes in this sense.
import { runCheck } from '../../model.mjs'
import { checkBehaviorHasInterface } from '../../contract.mjs'

runCheck(checkBehaviorHasInterface)
