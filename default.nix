{
  lib,
  config,
  dream2nix,
  ...
}:
{
  imports = [
    dream2nix.modules.dream2nix.nodejs-package-lock-v3
    dream2nix.modules.dream2nix.nodejs-devshell-v3
    dream2nix.modules.dream2nix.nodejs-granular-v3
  ];

  mkDerivation = {
    src = ./.;
  };
  deps =
    { nixpkgs, ... }:
    {
      inherit (nixpkgs) fetchFromGitHub stdenv;
    };

  nodejs-package-lock-v3 = {
    packageLockFile = "${config.mkDerivation.src}/package-lock.json";
  };

  name = "personal-site";
  version = "0.0.1";
}
