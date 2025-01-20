{
  description = "A Flake for my Personal Website";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    dream2nix.url = "github:nix-community/dream2nix";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, dream2nix, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        d2n = dream2nix.lib.init {
          systems = [ system ];
          config.projectRoot = ./.;
        };

        website = d2n.makeOutputs {
          source = ./.;
          packageOverrides = {
            website = {
              buildInputs = with pkgs; [
                nodejs
                nodePackages.npm
              ];
              buildPhase = ''
                npm install
                npm run build
              '';
              installPhase = ''
                mkdir -p $out/bin
                cp -r build $out/
                cp -r node_modules $out/
                cp package.json $out/
                
                # Create start script
                cat > $out/bin/start-website <<EOF
                #!${pkgs.bash}/bin/bash
                exec ${pkgs.nodejs}/bin/node --env-file=.env $out/build/index.js
                EOF
                chmod +x $out/bin/start-website
              '';
            };
          };
        };
      in
      {
        packages.default = website.packages.${system}.website;
        devShells.default = pkgs.mkShell
          {
            buildInputs = with pkgs; [
              nodejs
              nodePackages.npm
              nodePackages.typescript
              nodePackages.typescript-language-server
            ];

            shellHook = ''
              echo "🚀 Welcome to the SvelteKit development environment!"
              echo "Running npm install..."
              npm install
              echo "Starting development server..."
              npm run dev -- --open
            '';
          };
      }
    );
}
