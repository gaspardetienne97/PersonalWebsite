{
  description = "A Flake for my Personal Website with Deno 2 and SvelteKit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        name = "personal-website";
      in
      {
        packages.default = pkgs.stdenv.mkDerivation {
          pname = name;
          version = "0.1.0";
          src = ./.;

          buildInputs = [
            pkgs.deno
            pkgs.nodejs_22
          ];

          buildPhase = ''
            runHook preBuild

            echo "🔧 Setting up Deno environment..."
            export DENO_DIR=$(mktemp -d)
            export DISABLE_PARAGLIDE_PLUGIN=true
            export DATABASE_URL="sqlite://dummy.db"  # Dummy DB URL for build
            export BUILDING=true  # Skip some runtime dependencies during build

            # Generate paraglide messages if needed
            if [ -f ./project.inlang/settings.json ]; then
              echo "🌐 Generating paraglide messages..."
              mkdir -p src/lib/paraglide/messages
              echo "export const hello_world = () => 'Hello World';" > src/lib/paraglide/messages.js
              echo "export const sourceLanguageTag = 'en'; export const availableLanguageTags = ['en']; export const languageTag = () => 'en'; export const setLanguageTag = () => {}; export const isAvailableLanguageTag = () => true;" > src/lib/paraglide/runtime.js
            fi

            echo "🏗️ Building SvelteKit app with Deno..."
            deno run --allow-all npm:vite build --mode production

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            echo "📦 Installing built application..."
            mkdir -p $out

            # Copy built application
            if [ -d build ]; then
              cp -r build $out/
            fi

            # Copy static assets if they exist
            if [ -d static ]; then
              cp -r static $out/
            fi

            # Copy package.json for runtime info
            cp package.json $out/ || true
            cp deno.json $out/ || true

            runHook postInstall
          '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            deno
            nodejs # Keep Node.js for any npm packages that might be needed
          ];

          shellHook = ''
            echo "🚀 Welcome to the Deno 2 SvelteKit development environment!"
            echo "Deno version: $(deno --version)"
            echo ""
            echo "Available commands:"
            echo "  deno task dev    - Start development server"
            echo "  deno task build  - Build for production"
            echo "  deno task preview - Preview production build"
          '';
        };
      }
    );
}
