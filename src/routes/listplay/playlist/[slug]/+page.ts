import type { Load } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
export const ssr = false;
export const load: Load = ({ params }) => {
	if (params.slug) {
		return {
			id: params.slug
		};
	}
	error(404, 'Not found');
};
