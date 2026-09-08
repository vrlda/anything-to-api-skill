#!/usr/bin/env node
import { Anything, EnvironmentAuthProvider } from "@anything-to-api/runtime";
import { serveSiteOverStdio } from "./index.js";

const site = process.argv[2];
if (!site) { console.error("Usage: anything-mcp <site>"); process.exit(2); }
const paths = process.env.ANYTHING_SITES?.split(":").filter(Boolean);
const allowConsequential = process.env.ANYTHING_ALLOW_SIDE_EFFECTS === "1";
await serveSiteOverStdio(new Anything({ paths, authProviders: [new EnvironmentAuthProvider()], authorize: (_site, _command, effect) => effect === "read" || allowConsequential }), site);
