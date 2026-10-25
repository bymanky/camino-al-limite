import type { Team } from "./model";
export const receiptLink = (token: string) =>
  `${location.origin}${location.pathname}#/comprobante/${token}`;
export const receiptPdf = (team: Team, token: string) =>
  import("./pdf").then((m) => m.receiptPdf(team, token));
export const rosterPdf = (teams: Team[]) =>
  import("./pdf").then((m) => m.rosterPdf(teams));
