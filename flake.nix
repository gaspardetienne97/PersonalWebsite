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

      # Fixed-output, so this hash must be bumped whenever pnpm-lock.yaml
      # changes. Nothing checks that automatically: if the build suddenly fails
      # with a hash mismatch, take the `got:` value from the error.
      pnpmDeps = pnpm.fetchDeps {
        pname = "personal-website-pnpm-deps";
        version = "0.1.0";
        inherit src;
        fetcherVersion = 2;
        hash = "sha256-qYC+uL5iHWJSFMnGC015jjHjFA7ZbMmEIkoUzyM2HYc=";
      };

      web = pkgs.stdenv.mkDerivation {
        pname = "personal-website-web";
        version = "0.1.0";
        inherit src pnpmDeps;

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

          # nixpkgs supplies pnpm, but `packageManager` tells pnpm to go fetch
          # its own pinned build from registry.npmjs.org, and there is no
          # network in the sandbox. A --config flag on the pnpm calls below
          # would not help: the pnpm that `vp config` spawns does not inherit
          # it. Removing the field is what actually settles it.
          node -e 'const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json", "utf8")); delete p.packageManager; fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");'

          pnpm run prepare
          pnpm run build

          test -f build/index.js || {
            echo "build/index.js is missing: the vite build produced no server entry" >&2
            exit 1
          }

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall

          mkdir -p "$out/bin" "$out/lib"

          cp -R build "$out/lib/build"
          cp package.json "$out/lib/package.json"
          # adapter-node leaves production dependencies external -- the server
          # bundle imports better-auth, drizzle-orm, postgres and @repo/i18n by
          # name -- so node_modules has to ship. It is ~1.5G, nearly all of it
          # devDependencies. `pnpm prune --prod` would be the fix but it hangs
          # in the sandbox, seemingly reaching for the registry, so the fat
          # copy stands for now.
          cp -R node_modules "$out/lib/node_modules"

          # Every workspace package, not a hand-picked list: node_modules holds
          # one @repo/* symlink per package, and a package missing here is a
          # dangling symlink that fails noBrokenSymlinks. `ui` was the only one
          # when this was a list; i18n, music-core and pdf-core came later and
          # broke the build.
          cp -R packages "$out/lib/packages"

          cat > "$out/bin/personal-website" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")/../lib"
exec ${nodejs}/bin/node build/index.js "\$@"
EOF
          chmod +x "$out/bin/personal-website"

          runHook postInstall
        '';
      };
    in
    {
      packages.${system} = {
        inherit web;
        default = web;
      };

      apps.${system} = {
        web = {
          type = "app";
          program = "${self.packages.${system}.web}/bin/personal-website";
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
          echo "  vp check                  - Run Vite+ checks"
          echo "  vp test                   - Run Vite+ tests"
          echo "  vp build                  - Build the root app"
          echo "  vp run --recursive build  - Build every workspace package"
        '';
      };
    };
}
