export type Post = {
  title: string;
  slug: string;
  description: string;
  /** As written in front matter: 2024-9-16, or 2024-9-16 18:30 to order two posts of one day. */
  date: string;
  categories: string[];
  published: boolean;
  /** Optional cover image URL; posts without one get generated circuit art. */
  cover?: string;
  readingMinutes: number;
};

/** A section heading inside a post, for the "On this page" list. */
export type PostHeading = { depth: 2 | 3; text: string; id: string };
