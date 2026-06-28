#!/usr/bin/env node
/**
 * Proposal 3 — generate dev PKI + client configs (mal / southwood / aiac metadata).
 */
import { runProtocolTlsInitProposal3 } from "../src/commands/protocol.js";

const force = process.argv.includes("--force");
runProtocolTlsInitProposal3({ force });
