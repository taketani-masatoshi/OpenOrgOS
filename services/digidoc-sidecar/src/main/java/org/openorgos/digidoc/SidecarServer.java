package org.openorgos.digidoc;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.digidoc4j.Configuration;
import org.digidoc4j.Container;
import org.digidoc4j.ContainerBuilder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * Minimal digidoc4j HTTP sidecar for OrgOS pdf_esign (Phase D3 hardened).
 *
 * POST /container/create — PDF (base64) → unsigned ASiC-E (.asice) bytes (base64).
 * Does NOT sign, store PIN, or validate (validation = SiVa).
 *
 * Auth: Bearer token via DIGIDOC_SIDECAR_TOKEN (required unless ALLOW_UNAUTHENTICATED=true for local smoke).
 */
public final class SidecarServer {
  private static final Gson GSON = new Gson();
  private static final Pattern SAFE_PDF_NAME =
      Pattern.compile("^[\\w.\\- ()]+\\.pdf$", Pattern.CASE_INSENSITIVE);
  private static final AtomicBoolean READY = new AtomicBoolean(false);

  private static final int DEFAULT_MAX_BODY = 35 * 1024 * 1024;
  private static final int DEFAULT_MAX_PDF = 25 * 1024 * 1024;

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "9090"));
    String bind = System.getenv().getOrDefault("BIND", "0.0.0.0");
    String token = System.getenv().getOrDefault("DIGIDOC_SIDECAR_TOKEN", "").trim();
    boolean allowUnauth =
        "true".equalsIgnoreCase(System.getenv().getOrDefault("ALLOW_UNAUTHENTICATED", "false"));
    int maxBody = Integer.parseInt(System.getenv().getOrDefault("MAX_BODY_BYTES", String.valueOf(DEFAULT_MAX_BODY)));
    int maxPdf = Integer.parseInt(System.getenv().getOrDefault("MAX_PDF_BYTES", String.valueOf(DEFAULT_MAX_PDF)));

    Configuration configuration = Configuration.of(Configuration.Mode.PROD);
    if (token.isEmpty()) {
      String tokenFile = System.getenv().getOrDefault("DIGIDOC_SIDECAR_TOKEN_FILE", "").trim();
      if (!tokenFile.isEmpty()) {
        token = java.nio.file.Files.readString(java.nio.file.Path.of(tokenFile)).trim();
      }
    }
    final String authToken = token;
    READY.set(true);

    HttpServer server = HttpServer.create(new InetSocketAddress(bind, port), 0);
    server.setExecutor(Executors.newFixedThreadPool(
        Math.max(2, Runtime.getRuntime().availableProcessors())));

    server.createContext("/health", ex -> {
      if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
        respond(ex, 405, Map.of("ok", false, "error", "method_not_allowed"));
        return;
      }
      respond(ex, 200, Map.of("ok", true, "service", "digidoc-sidecar", "digidoc4j", "skeleton-only"));
    });

    server.createContext("/ready", ex -> {
      if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
        respond(ex, 405, Map.of("ok", false, "error", "method_not_allowed"));
        return;
      }
      if (!READY.get()) {
        respond(ex, 503, Map.of("ok", false, "error", "not_ready"));
        return;
      }
      respond(ex, 200, Map.of("ok", true, "ready", true));
    });

    server.createContext("/container/create", ex -> {
      if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
        respond(ex, 405, Map.of("ok", false, "error", "method_not_allowed"));
        return;
      }
      if (!authorize(ex, authToken, allowUnauth)) {
        respond(ex, 401, Map.of("ok", false, "error", "unauthorized"));
        return;
      }
      String ct = ex.getRequestHeaders().getFirst("Content-Type");
      if (ct == null || !ct.toLowerCase().startsWith("application/json")) {
        respond(ex, 415, Map.of("ok", false, "error", "content_type_must_be_json"));
        return;
      }
      try {
        byte[] rawBody = readLimited(ex.getRequestBody(), maxBody);
        if (rawBody.length == 0) {
          respond(ex, 400, Map.of("ok", false, "error", "empty_body"));
          return;
        }
        String body = new String(rawBody, StandardCharsets.UTF_8);
        JsonObject req = GSON.fromJson(body, JsonObject.class);
        if (req == null || !req.has("document") || !req.has("filename")) {
          respond(ex, 400, Map.of("ok", false, "error", "filename_and_document_required"));
          return;
        }
        String filename = req.get("filename").getAsString();
        if (!SAFE_PDF_NAME.matcher(filename).matches()) {
          respond(ex, 400, Map.of("ok", false, "error", "unsafe_filename"));
          return;
        }
        String mime = req.has("mimeType") ? req.get("mimeType").getAsString() : "application/pdf";
        if (!"application/pdf".equalsIgnoreCase(mime)) {
          respond(ex, 400, Map.of("ok", false, "error", "mime_must_be_pdf"));
          return;
        }
        byte[] pdf;
        try {
          pdf = Base64.getDecoder().decode(req.get("document").getAsString());
        } catch (IllegalArgumentException e) {
          respond(ex, 400, Map.of("ok", false, "error", "invalid_base64"));
          return;
        }
        if (pdf.length == 0 || pdf.length > maxPdf) {
          respond(ex, 413, Map.of("ok", false, "error", "pdf_size_invalid"));
          return;
        }
        if (pdf.length < 5 || pdf[0] != '%' || pdf[1] != 'P' || pdf[2] != 'D' || pdf[3] != 'F' || pdf[4] != '-') {
          respond(ex, 400, Map.of("ok", false, "error", "not_pdf_magic"));
          return;
        }

        try (InputStream in = new ByteArrayInputStream(pdf)) {
          Container container = ContainerBuilder
              .aContainer(Container.DocumentType.ASICE)
              .withConfiguration(configuration)
              .withDataFile(in, filename, mime)
              .build();
          ByteArrayOutputStream bos = new ByteArrayOutputStream();
          try (InputStream asiceStream = container.saveAsStream()) {
            asiceStream.transferTo(bos);
          }
          String b64 = Base64.getEncoder().encodeToString(bos.toByteArray());
          respond(ex, 200, Map.of(
              "ok", true,
              "filename", stripExt(filename) + ".asice",
              "document", b64,
              "byte_length", bos.size()
          ));
        }
      } catch (Exception e) {
        String msg = e.getMessage() != null ? e.getMessage() : "create_failed";
        if (msg.contains("body_too_large")) {
          respond(ex, 413, Map.of("ok", false, "error", "body_too_large"));
        } else {
          respond(ex, 500, Map.of("ok", false, "error", msg));
        }
      }
    });

    System.out.println("digidoc-sidecar listening on " + bind + ":" + port
        + " (unsigned ASiC-E only; auth=" + (!authToken.isEmpty() || !allowUnauth) + ")");
    server.start();
  }

  private static boolean authorize(HttpExchange ex, String token, boolean allowUnauth) {
    if (token.isEmpty()) {
      return allowUnauth;
    }
    String auth = ex.getRequestHeaders().getFirst("Authorization");
    if (auth == null) return false;
    String prefix = "Bearer ";
    if (!auth.regionMatches(true, 0, prefix, 0, prefix.length())) return false;
    String provided = auth.substring(prefix.length()).trim();
    return constantTimeEquals(token, provided);
  }

  private static boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null || a.length() != b.length()) return false;
    int r = 0;
    for (int i = 0; i < a.length(); i++) {
      r |= a.charAt(i) ^ b.charAt(i);
    }
    return r == 0;
  }

  private static byte[] readLimited(InputStream in, int max) throws IOException {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    int n;
    int total = 0;
    while ((n = in.read(buf)) >= 0) {
      total += n;
      if (total > max) {
        throw new IOException("body_too_large");
      }
      bos.write(buf, 0, n);
    }
    return bos.toByteArray();
  }

  private static String stripExt(String name) {
    int i = name.lastIndexOf('.');
    return i > 0 ? name.substring(0, i) : name;
  }

  private static void respond(HttpExchange ex, int status, Map<String, ?> body) throws IOException {
    byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
    ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    ex.getResponseHeaders().set("Cache-Control", "no-store");
    ex.sendResponseHeaders(status, bytes.length);
    try (OutputStream os = ex.getResponseBody()) {
      os.write(bytes);
    }
  }

  private SidecarServer() {}
}
