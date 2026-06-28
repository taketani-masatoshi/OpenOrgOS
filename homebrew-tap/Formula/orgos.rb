# OrgOS Core — Homebrew formula
# Usage:
#   brew tap orgos-reference/tap
#   brew install orgos
#
# Or from local tap:
#   brew install ./homebrew-tap/Formula/orgos.rb

class Orgos < Formula
  desc "OrgOS Core CLI — Organizational OS"
  homepage "https://github.com/orgos-reference/orgos"
  url "https://github.com/orgos-reference/orgos/archive/refs/tags/v0.8.0.tar.gz"
  sha256 "SKIP_ON_FIRST_RELEASE"
  license "MIT"
  head "https://github.com/orgos-reference/orgos.git", branch: "main"

  depends_on "node@22"
  depends_on "openssl"

  def install
    system "npm", "ci", "--omit=dev"
    system "npm", "run", "build:package"
    cd "packages/orgos-cli" do
      system "npm", "install", "--omit=dev", "--no-package-lock"
    end
    libexec.install Dir["packages/orgos-cli/*"]
    (bin/"orgos").write_env_script libexec/"bin/orgos.js", ORGOS_HOME: libexec
    (bin/"steward").write_env_script libexec/"bin/orgos.js", ORGOS_HOME: libexec
  end

  def caveats
    <<~EOS
      Quickstart:
        mkdir ~/my-company-orgos && cd ~/my-company-orgos
        orgos workspace init
        orgos init acme --name "ACME Corp"
        orgos doctor
      Wire (optional):
        orgos wire setup
    EOS
  end

  test do
    ENV["ORGOS_HOME"] = libexec
    assert_match "OrgOS", shell_output("#{bin}/orgos --version")
    system bin/"orgos", "doctor", "--json"
  end
end
