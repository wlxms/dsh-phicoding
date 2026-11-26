#!/usr/bin/env node
// META_SURFACE_04 - PureDTO isolation.
//
// PureDTO is external known data: the module may reference it, but it may not
// reference module-owned types. Otherwise a DTO becomes a hidden domain model
// and the dependency turns back into the module.
import { runCheck } from '../../model.mjs'
import { checkPureDtoIsolation } from '../../contract.mjs'

runCheck(checkPureDtoIsolation)
