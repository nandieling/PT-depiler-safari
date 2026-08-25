/**
 * @JackettIssue https://github.com/Jackett/Jackett/issues/10161
 */
import type { ISiteMetadata } from "../types";

export const siteMetadata: ISiteMetadata = {
  version: 1,
  id: "gfxpeers",
  name: "GFXPeers",

  collaborator: ["bimzcy"],

  type: "private",
  schema: "Gazelle",

  urls: ["https://gfxpeers.net/"],

  isDead: true,
};
