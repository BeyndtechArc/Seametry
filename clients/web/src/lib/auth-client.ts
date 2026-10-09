"use client";

import { createAuthClient } from "better-auth/react";

// Account requests remain first-party in the browser. The matching Next routes
// are deliberately thin proxies; the auth authority and database live on the
// Oracle service.
export const authClient = createAuthClient();
