#!/usr/bin/env node
// META_DIR_CLASS_04 - pure data (records/classes; structs are data by definition).
//
// A struct is a value type and is data even when it has methods; struct
// behavior is judged by a separate soft rule, not by forcing an interface onto
// it. A record or sealed data class with behavior is still a role error, and a
// data field that points at an interface or behavior class is not pure data.
import { runCheck } from '../../model.mjs'
import { checkPureData } from '../../contract.mjs'

runCheck(checkPureData)
