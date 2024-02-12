<script>
const SPOTIFY_CLIENT_ID = "YOUR_CLIENT_ID";
const REDIRECT_URI = "http://localhost:3000/callback";

let accessToken = "";

const handleLoginClick = async () => {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.append("client_id", SPOTIFY_CLIENT_ID);
  url.searchParams.append("redirect_uri", REDIRECT_URI);
  url.searchParams.append("scope", "user-read-private user-read-email");
  url.searchParams.append("response_type", "token");

  window.location.href = url.toString();
};

const handleRedirect = async () => {
  const hash = window.location.hash;
  const accessToken = hash.substring(hash.indexOf("access_token=") + 14, hash.indexOf("&"));
  if (accessToken) {
    window.location.href = "/";
    // Store the access token in localStorage or a cookie
    localStorage.setItem("spotify_access_token", accessToken);
  }
};

if (window.location.pathname === "/callback") {
  handleRedirect();
}

const getUserData = async () => {
  const response = await axios.get("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  console.log(response.data);
};

accessToken = localStorage.getItem("spotify_access_token");

if (accessToken) {
  getUserData();
}
</script>

<button on:click={handleLoginClick}>Login with Spotify</button>
