import type { Post } from '$lib/types';
import { json } from '@sveltejs/kit';

async function getPosts() {
	let posts: Post[] = [];

	const paths = import.meta.glob('/src/lib/blog-posts/*.md', { eager: true });

	for (const path in paths) {
		const file = paths[path];
		const slug = path.split('/').at(-1)?.replace('.md', '');

		if (file && typeof file === 'object' && 'metadata' in file && slug) {
			const metadata = file.metadata as Omit<Post, 'slug'>;
			const post = {
				...metadata,
				slug,
				thumbnail: 'https://cdn.hashnode.com/res/hashnode/image/stock/unsplash/6Vg8N8u61aI/upload/1c41a9e4a644df473e8a2c7af1027f67.jpeg?w=1600&h=840&fit=crop&crop=entropy&auto=compress,format&format=webp'
			} satisfies Post;
			if (post.published) {
				posts.push(post);
			}
		}
	}

	posts = posts.sort(
		(first, second) => new Date(second.date).getTime() - new Date(first.date).getTime()
	);

	return posts;
}

export async function GET() {
	const posts = await getPosts();
	return json(posts);
}
