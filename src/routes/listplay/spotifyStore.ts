import { env } from '$env/dynamic/public';
import { Scopes, SpotifyApi, type UserProfile } from '@spotify/web-api-ts-sdk';
import { getContext, setContext } from 'svelte';

export class Spotify {
	private sdk?: SpotifyApi;
	private user?: UserProfile;
	private redirectURL;
	constructor(redirectURL?: string) {
		this.redirectURL = redirectURL;
		this.sdk = redirectURL
			? SpotifyApi.withUserAuthorization(env.PUBLIC_SPOTIFY_CLIENT_ID, redirectURL, [
					...Scopes.playlist,
					...Scopes.userDetails
				])
			: undefined;
	}

	isAuthenticated = async () => {
		const { authenticated } = (await this.sdk?.authenticate()) ?? { authenticated: false };
		return authenticated;
	};

	login() {
		if (!this.sdk) {
			this.sdk = this.redirectURL
				? SpotifyApi.withUserAuthorization(
						env.PUBLIC_SPOTIFY_CLIENT_ID,
						this.redirectURL,
						Scopes.all
					)
				: undefined;
		}
	}

	logout() {
		return this.sdk?.logOut();
	}

	getUser = async () => {
		return this.user ? this.user : await this.sdk?.currentUser.profile();
	};

	getUserPlaylists = async () => {
		return (await this.sdk?.currentUser.playlists.playlists())?.items ?? [];
	};
	getPlaylist = async (id: string) => {
		return (await this.sdk?.playlists.getPlaylist(id))?.tracks.items ?? [];
	};
	createTopPlaylist = async () => {
		const date = new Date();
		const topSongURIs = (
			await this.sdk?.currentUser.topItems('tracks', 'medium_term', 50)
		)?.items.map((track) => track.uri);
		let newPlaylist;
		if (this.user) {
			newPlaylist = await this.sdk?.playlists.createPlaylist(this.user.id, {
				name: `ListPlay:${date.getFullYear}-${date.getMonth} Top Listened Tracks`,
				public: false,
				description: `Your most listened to tracks of ${date.getMonth}-${date.getFullYear}`
			});
		}
		if (newPlaylist) {
			this.sdk?.playlists.addItemsToPlaylist(newPlaylist.id, topSongURIs);
			return (await this.sdk?.playlists.getPlaylist(newPlaylist?.id))?.tracks.items ?? [];
		} else {
			throw new Error('Could not create playlist');
		}
	};
}

export function createSpotifyStore(redirectURL: string) {
	setContext('spotifyStore', new Spotify(redirectURL));
}

export function readSpotifyStore() {
	return getContext<Spotify>('spotifyStore');
}
