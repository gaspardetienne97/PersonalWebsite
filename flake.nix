{
  description = "A Flake for my Personal Website";

  # We import the latest commit of dream2nix main branch and instruct nix to
  # re-use the nixpkgs revision referenced by dream2nix.
  # This is what we test in CI with, but you can generally refer to any
  # recent nixpkgs commit here.
  inputs = {
    dream2nix.url = "github:nix-community/dream2nix";
    nixpkgs.follows = "dream2nix/nixpkgs";
  };

  outputs =
    { dream2nix
    , nixpkgs
    , ...
    }:
    let
      # A helper that helps us define the attributes below for
      # all systems we care about.
      eachSystem = nixpkgs.lib.genAttrs [
        "x86_64-linux"
      ];
    in
    {
      packages = eachSystem (system: {
        # For each system, we define our default package
        # by passing in our desired nixpkgs revision plus
        # any dream2nix modules needed by it.
        default = dream2nix.lib.evalModules {
          packageSets.nixpkgs = nixpkgs.legacyPackages.${system};
          modules = [
            # Import our actual package definiton as a dream2nix module from ./default.nix
            (
              { config
              , dream2nix
              , ...
              }:
              {
                imports = [
                  dream2nix.modules.dream2nix.nodejs-package-lock-v3
                  dream2nix.modules.dream2nix.nodejs-granular-v3
                  dream2nix.modules.dream2nix.nodejs-devshell-v3
                ];

                mkDerivation = {
                  src = ./.;
                };

                deps =
                  { nixpkgs, ... }:
                  {
                    inherit (nixpkgs)
                      fetchFromGitHub
                      stdenv
                      mkShell
                      rsync
                      ;
                  };

                nodejs-package-lock-v3 = {
                  packageLockFile = "${config.mkDerivation.src}/package-lock.json";
                };

                name = "personal-website";
                version = "0.1.0";
              }
            )
            {
              # Aid dream2nix to find the project root. This setup should also works for mono
              # repos. If you only have a single project, the defaults should be good enough.
              paths.projectRoot = ./.;
              # can be changed to ".git" or "flake.nix" to get rid of .project-root
              paths.projectRootFile = "flake.nix";
              paths.package = ./.;
            }
          ];
        };
      });
    };
}
