#!/usr/bin/env node
// Usage: npm run gen-secret
// Prints a long random secret, suitable for API_TOKEN, SESSION_SECRET or ACCESS_LINK_SECRET.
// Use a different value for each variable.
import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("base64url"));
