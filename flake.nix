{
  description = "SvelteKit Vite+ workspace";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nix-vite-plus.url = "github:ryoppippi/nix-vite-plus";
  };

  outputs =
    { self, nixpkgs, nix-vite-plus, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      lib = pkgs.lib;

      nodejs = pkgs.nodejs_24;
      pnpm = pkgs.pnpm_10;

      src = lib.cleanSourceWith {
        src = ./.;
        filter =
          path: type:
          let
            baseName = baseNameOf path;
          in
          ! (
            baseName == ".direnv"
            || baseName == ".git"
            || baseName == "node_modules"
            || baseName == "build"
            || baseName == ".svelte-kit"
            || baseName == "dist"
            || baseName == "result"
          );
      };

      pnpmDeps = pnpm.fetchDeps {
        pname = "personal-website-pnpm-deps";
        version = "0.1.0";
        inherit src;
        fetcherVersion = 2;
        hash = "sha256-ldviHKd42dwWbceHpHipGo3rSV2FvZfogCr07BPlulQ=";
      };

      mkSvelteKitPackage =
        {
          pname,
          packageDir ? ".",
          binName ? pname,
        }:
        pkgs.stdenv.mkDerivation {
          inherit pname src pnpmDeps;
          version = "0.1.0";

          nativeBuildInputs = [
            nodejs
            pnpm
            pnpm.configHook
            pkgs.gitMinimal
          ];

          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";

          buildPhase = ''
            runHook preBuild

            export HOME="$TMPDIR"
            export NODE_ENV=production
            export COREPACK_ENABLE_PROJECT_SPEC=0

            pnpm --config.manage-package-manager-versions=false run prepare
            if [ ! -f .svelte-kit/tsconfig.json ]; then
              mkdir -p .svelte-kit/types
              cat > .svelte-kit/tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "paths": {
      "$lib": ["../src/lib"],
      "$lib/*": ["../src/lib/*"],
      "$app/types": ["./types/index.d.ts"]
    },
    "rootDirs": ["..", "./types"],
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "lib": ["esnext", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "module": "esnext",
    "noEmit": true,
    "target": "esnext",
    "types": ["node"]
  },
  "include": [
    "../vite.config.js",
    "../vite.config.ts",
    "../src/**/*.js",
    "../src/**/*.ts",
    "../src/**/*.svelte"
  ],
  "exclude": ["../node_modules/**"]
}
JSON
            fi

            (
              cd ${lib.escapeShellArg packageDir}
              pnpm --config.manage-package-manager-versions=false run build
            )

            if [ ! -d "${packageDir}/build" ]; then
              echo "Build failed: ${packageDir}/build directory not found"
              exit 1
            fi

            if [ ! -f "${packageDir}/build/index.js" ]; then
              echo "Build failed: ${packageDir}/build/index.js not found"
              exit 1
            fi

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p "$out/bin" "$out/lib" "$out/lib/packages" "$out/lib/apps/pdf" "$out/lib/apps/drums"

            cp -R "${packageDir}/build" "$out/lib/build"
            cp "${packageDir}/package.json" "$out/lib/package.json"
            cp -R node_modules "$out/lib/node_modules"
            cp -R packages/ui "$out/lib/packages/ui"
            rm -rf "$out/lib/packages/ui/node_modules"
            cp apps/pdf/package.json "$out/lib/apps/pdf/package.json"
            cp apps/drums/package.json "$out/lib/apps/drums/package.json"

            cat > "$out/bin/${binName}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")/../lib"
exec ${nodejs}/bin/node build/index.js "\$@"
EOF
            chmod +x "$out/bin/${binName}"

            runHook postInstall
          '';
        };
    in
    {
      packages.${system} = {
        web = mkSvelteKitPackage {
          pname = "personal-website-web";
          binName = "personal-website";
        };

        pdf = mkSvelteKitPackage {
          pname = "personal-website-pdf";
          packageDir = "apps/pdf";
          binName = "personal-website-pdf";
        };

        drums = mkSvelteKitPackage {
          pname = "personal-website-drums";
          packageDir = "apps/drums";
          binName = "personal-website-drums";
        };

        default = self.packages.${system}.web;
      };

      apps.${system} = {
        web = {
          type = "app";
          program = "${self.packages.${system}.web}/bin/personal-website";
        };

        pdf = {
          type = "app";
          program = "${self.packages.${system}.pdf}/bin/personal-website-pdf";
        };

        drums = {
          type = "app";
          program = "${self.packages.${system}.drums}/bin/personal-website-drums";
        };

        default = self.apps.${system}.web;
      };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          nodejs
          pnpm
          nix-vite-plus.packages.${system}.vp
        ];

        shellHook = ''
          echo "Vite+ SvelteKit workspace"
          echo "Node.js version: $(node --version)"
          echo "pnpm version: $(pnpm --version)"
          echo ""
          echo "Available commands:"
          echo "  vp dev                    - Start the root app"
          echo "  vp run dev:pdf            - Start the PDF app"
          echo "  vp run dev:drums          - Start the drums app"
          echo "  vp check                  - Run Vite+ checks"
          echo "  vp test                   - Run Vite+ tests"
          echo "  vp build                  - Build the root app"
          echo "  vp run --recursive build  - Build all workspace apps"
        '';
      };
    };
}
