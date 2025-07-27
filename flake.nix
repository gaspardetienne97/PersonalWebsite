{
  description = "A SvelteKit app with Node.js and dream2nix";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    dream2nix.url = "github:nix-community/dream2nix";
  };

  outputs = { self, nixpkgs, dream2nix }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system}.default = dream2nix.lib.evalModules {
        packageSets.nixpkgs = pkgs;
        modules = [
          {
            imports = [
              dream2nix.modules.dream2nix.nodejs-package-lock-v3
              dream2nix.modules.dream2nix.nodejs-granular-v3
            ];

            mkDerivation = {
              src = pkgs.lib.cleanSourceWith {
                src = ./.;
                filter = path: type:
                  let
                    baseName = baseNameOf path;
                  in
                  # Exclude development and build artifacts
                  ! (baseName == ".direnv" ||
                     baseName == ".git" ||
                     baseName == "node_modules" ||
                     baseName == "build" ||
                     baseName == ".svelte-kit" ||
                     baseName == "dist" ||
                     baseName == "result");
              };
              installPhase = ''
                runHook preInstall

                mkdir -p $out/bin $out/lib

                # Copy the entire build output including package.json
                if [ -d "build" ]; then
                  cp -r build $out/lib/
                else
                  echo "Error: build directory not found!"
                  exit 1
                fi

                # Copy package.json for runtime dependencies info
                cp package.json $out/lib/
                
                # Copy node_modules if present (production dependencies)
                if [ -d "node_modules" ]; then
                  cp -r node_modules $out/lib/
                fi

                # Create wrapper script that properly runs the SvelteKit app
                cat > $out/bin/personal-website << 'EOF'
#!/usr/bin/env bash
set -e

# Change to the lib directory where our app is located
cd "$(dirname "$0")/../lib"

# Run the SvelteKit Node.js server
exec ${pkgs.nodejs}/bin/node build/index.js "$@"
EOF
                chmod +x $out/bin/personal-website

                runHook postInstall
              '';

              buildPhase = ''
                runHook preBuild

                echo "🔧 Setting up build environment..."
                export NODE_ENV="production"
                # DATABASE_URL will be provided at runtime by the systemd service
                
                echo "🏗️ Building SvelteKit app with adapter-node..."
                npm run build
                
                echo "📋 Verifying build output..."
                if [ ! -d "build" ]; then
                  echo "❌ Build failed: build directory not found"
                  exit 1
                fi
                
                if [ ! -f "build/index.js" ]; then
                  echo "❌ Build failed: index.js not found in build directory"
                  exit 1
                fi
                
                echo "✅ Build completed successfully"
                
                runHook postBuild
              '';


            };

            deps = { nixpkgs, ... }: {
              inherit (nixpkgs) stdenv;
            };

            nodejs-package-lock-v3 = {
              packageLockFile = "${./.}/package-lock.json";
            };

            name = "personal-website";
            version = "0.1.0";
          }
        ];
      };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs
        ];

        shellHook = ''
          echo "🚀 Welcome to the Node.js SvelteKit development environment!"
          echo "Node.js version: $(node --version)"
          echo "npm version: $(npm --version)"
          echo ""
          echo "Available commands:"
          echo "  npm run dev    - Start development server"
          echo "  npm run build  - Build for production"
          echo "  npm run preview - Preview production build"
        '';
      };
    };
}
