export type Post = {
  title: string;
  slug: string;
  description: string;
  date: string;
  categories: string[];
  published: boolean;
  /** Optional cover image URL; posts without one get generated circuit art. */
  cover?: string;
  readingMinutes: number;
};
