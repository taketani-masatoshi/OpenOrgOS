# OrgOS Wire — optional Homebrew formula (builds Wire Console SPA)
class OrgosWire < Formula
  desc "OrgOS Wire — Proposal 3 relay helpers + Wire Console UI"
  homepage "https://github.com/orgos-reference/orgos"
  url "https://github.com/orgos-reference/orgos/archive/refs/tags/v0.8.0.tar.gz"
  sha256 "SKIP_ON_FIRST_RELEASE"
  license "MIT"
  head "https://github.com/orgos-reference/orgos.git", branch: "main"

  depends_on "orgos"
  depends_on "node@22"

  def install
    system "npm", "ci"
    system "npm", "run", "wire-console:build"
    pkg = prefix/"wire-console"
    pkg.install Dir["apps/wire-console/dist/*"]
  end

  def caveats
    <<~EOS
      Wire Console SPA installed to #{prefix}/wire-console
      Run from your workspace:
        orgos wire setup
        orgos wire console start
    EOS
  end
end
