import { describe, expect, it } from "vitest";
import { collectSessionChannels, pickContinuationToken } from "./youtube-session";

describe("YouTube session payload parser", () => {
  it("collects channels from nested browse payloads and deduplicates by channel id", () => {
    const payload = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  richGridRenderer: {
                    contents: [
                      {
                        richItemRenderer: {
                          content: {
                            channelRenderer: {
                              channelId: "UC-alpha",
                              title: { runs: [{ text: "Alpha Studio" }] },
                              navigationEndpoint: {
                                browseEndpoint: {
                                  browseId: "UC-alpha",
                                  canonicalBaseUrl: "/@alpha"
                                }
                              },
                              thumbnail: {
                                thumbnails: [
                                  { url: "https://img.test/a-48.jpg" },
                                  { url: "https://img.test/a-88.jpg" }
                                ]
                              }
                            }
                          }
                        }
                      },
                      {
                        richItemRenderer: {
                          content: {
                            gridChannelRenderer: {
                              navigationEndpoint: {
                                browseEndpoint: {
                                  browseId: "UC-beta",
                                  canonicalBaseUrl: "/channel/UC-beta"
                                }
                              },
                              shortBylineText: { simpleText: "Beta Lab" },
                              avatar: { thumbnails: [{ url: "https://img.test/b.jpg" }] }
                            }
                          }
                        }
                      },
                      {
                        richItemRenderer: {
                          content: {
                            channelRenderer: {
                              channelId: "UC-alpha",
                              title: { simpleText: "Duplicate Alpha" }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    };

    expect(collectSessionChannels(payload)).toEqual([
      {
        id: "UC-alpha",
        name: "Alpha Studio",
        handle: "@alpha",
        avatarUrl: "https://img.test/a-88.jpg",
        url: "https://www.youtube.com/@alpha"
      },
      {
        id: "UC-beta",
        name: "Beta Lab",
        handle: undefined,
        avatarUrl: "https://img.test/b.jpg",
        url: "https://www.youtube.com/channel/UC-beta"
      }
    ]);
  });

  it("finds a continuation token in a nested payload", () => {
    const payload = {
      wrapper: {
        list: [
          {
            continuationItemRenderer: {
              continuationEndpoint: {
                continuationCommand: { token: "next-page-token" }
              }
            }
          }
        ]
      }
    };

    expect(pickContinuationToken(payload)).toBe("next-page-token");
  });
});
