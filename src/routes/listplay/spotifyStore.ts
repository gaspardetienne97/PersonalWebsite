import { PUBLIC_SPOTIFY_CLIENT_ID } from "$app/env/public";
import { Scopes, SpotifyApi, type UserProfile } from "@spotify/web-api-ts-sdk";
import { getContext, setContext } from "svelte";

export class Spotify {
  private sdk?: SpotifyApi;
  private user?: UserProfile;
  private redirectURL;
  constructor(redirectURL?: string) {
    this.redirectURL = redirectURL;

    this.sdk =
      redirectURL && PUBLIC_SPOTIFY_CLIENT_ID
        ? SpotifyApi.withUserAuthorization(PUBLIC_SPOTIFY_CLIENT_ID, redirectURL, [
            ...Scopes.playlist,
            ...Scopes.userDetails,
          ])
        : undefined;
  }

  /** False when this server has no Spotify client id, so nobody can sign in. */
  readonly configured = Boolean(PUBLIC_SPOTIFY_CLIENT_ID);

  /**
   * Whether someone is signed in. It only looks for a saved token, or finishes
   * the sign-in when Spotify has just sent the visitor back with a code:
   * `authenticate()` sends anyone without a token off to Spotify, which is for
   * `login` to do.
   */
  isAuthenticated = async () => {
    try {
      if (!this.sdk) return false;
      if (new URLSearchParams(location.search).has("code"))
        return (await this.sdk.authenticate()).authenticated;
      // ponytail: an expired token reads as signed out (one press signs back in);
      // refresh it here if that gets in the way.
      return (await this.sdk.getAccessToken()) !== null;
    } catch {
      // The server render (no browser storage), or a code Spotify would not exchange.
      return false;
    }
  };

  /** Sends the visitor to Spotify to sign in; they come back to the same page. */
  login = () => this.sdk?.authenticate();

  logout = () => {
    this.sdk?.logOut();
    location.reload();
  };

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
      await this.sdk?.currentUser.topItems("tracks", "medium_term", 50)
    )?.items.map((track) => track.uri);
    let newPlaylist;
    if (this.user) {
      newPlaylist = await this.sdk?.playlists.createPlaylist(this.user.id, {
        name: `ListPlay:${date.getFullYear}-${date.getMonth} Top Listened Tracks`,
        public: false,
        description: `Your most listened to tracks of ${date.getMonth}-${date.getFullYear}`,
      });
    }
    if (newPlaylist) {
      this.sdk?.playlists.addItemsToPlaylist(newPlaylist.id, topSongURIs);
      return (await this.sdk?.playlists.getPlaylist(newPlaylist?.id))?.tracks.items ?? [];
    } else {
      throw new Error("Could not create playlist");
    }
  };
}

export function createSpotifyStore(redirectURL: string) {
  return setContext("spotifyStore", new Spotify(redirectURL));
}

export function readSpotifyStore() {
  return getContext<Spotify>("spotifyStore");
}
