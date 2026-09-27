declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    PUBLIC_ORIGIN?: string;
    MAINTAINER_GITHUB_ID?: string;
    FINANCE_APPROVER_GITHUB_ID?: string;
  }
}
