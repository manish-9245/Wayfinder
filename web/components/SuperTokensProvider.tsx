"use client";
import React from "react";
import { SuperTokensWrapper } from "supertokens-auth-react";
import { AUTH_OFF, initSuperTokens } from "@/lib/supertokens";

if (typeof window !== "undefined") {
  initSuperTokens();
}

export default function SuperTokensProvider({ children }: { children: React.ReactNode }) {
  if (AUTH_OFF) return <>{children}</>;
  return <SuperTokensWrapper>{children}</SuperTokensWrapper>;
}
