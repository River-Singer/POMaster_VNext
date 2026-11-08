#!/usr/bin/env node
// 脚手架后端实证（CI 的 scaffold-java 任务）第一步：按一份领域规格生成一个完整项目。
//
// 用法：node scripts/scaffold-java/generate.mjs <spec.yaml> <目标目录>
//
// 走真实命令面：建仓 → 写后端技术基线（Java + Spring + MyBatis-Plus + MySQL）→ 规格确认 → 生成。
// 生成后在项目自有模块（种子，之后归项目）里放一个冒烟专用的认证实现：从请求头 X-Test-Actor
// 取操作者（id|userId|权限码,权限码）。真实项目按规格里的认证决策位实现 ActorProvider。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createStore } = await import(pathToFileURL(join(repo, "packages", "kernel", "dist", "index.js")).href);
const { runScaffoldConfirm, runScaffoldGenerate } = await import(pathToFileURL(join(repo, "packages", "cli", "dist", "index.js")).href);

const [specPath, targetArg] = process.argv.slice(2);
if (specPath === undefined || targetArg === undefined) {
  console.error("用法：node scripts/scaffold-java/generate.mjs <spec.yaml> <目标目录>");
  process.exit(2);
}
const target = resolve(targetArg);
mkdirSync(target, { recursive: true });

await createStore(target);
const authPath = join(target, ".pomaster", "state", "authority.json");
const authority = JSON.parse(readFileSync(authPath, "utf8"));
authority.authorities.BOOTSTRAP_OWNER = {};
writeFileSync(authPath, `${JSON.stringify(authority, null, 2)}\n`);

mkdirSync(join(target, ".pomaster", "baseline", "backend"), { recursive: true });
writeFileSync(
  join(target, ".pomaster", "baseline", "backend", "stack.yaml"),
  "language: java\nframework: spring\npersistence: mybatis-plus\ndatabase: mysql\ncache: none\n",
);
mkdirSync(join(target, ".pomaster", "scaffold"), { recursive: true });
writeFileSync(join(target, ".pomaster", "scaffold", "domain-spec.yaml"), readFileSync(resolve(specPath), "utf8"));

const confirmed = await runScaffoldConfirm(target, { by: "human:owner" });
if (!confirmed.ok) {
  console.error(confirmed.errors);
  process.exit(1);
}
const generated = await runScaffoldGenerate(target);
for (const warning of generated.warnings) console.log(`warning ${warning.code}: ${warning.message}`);
if (!generated.ok) {
  console.error(generated.errors);
  process.exit(1);
}
console.log(`generated ${generated.result.written.length} managed files, ${generated.result.seeded.length} seeds → ${target}`);

const manifest = JSON.parse(readFileSync(join(target, ".pomaster", "scaffold", "generation-manifest.json"), "utf8"));
const { key, java_package: pkg } = manifest.spec_snapshot.app;
const support = join(target, "backend", `${key}-support`);

// 项目自有模块归项目：加 Web 依赖（取当前请求用），放冒烟用的认证实现。
const pomPath = join(support, "pom.xml");
writeFileSync(
  pomPath,
  readFileSync(pomPath, "utf8").replace(
    "    </dependencies>",
    "        <dependency>\n            <groupId>org.springframework.boot</groupId>\n            <artifactId>spring-boot-starter-webmvc</artifactId>\n        </dependency>\n    </dependencies>",
  ),
);
const javaDir = join(support, "src", "main", "java", ...pkg.split("."), "support");
mkdirSync(javaDir, { recursive: true });
writeFileSync(
  join(javaDir, "HeaderActorProvider.java"),
  `package ${pkg}.support;

import ${pkg}.core.security.Actor;
import ${pkg}.core.security.ActorProvider;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 冒烟专用：从请求头 X-Test-Actor（id|userId|权限码,权限码）取操作者。不要用在真实项目里。 */
@Component
public class HeaderActorProvider implements ActorProvider {

    @Override
    public Optional<Actor> current() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            return Optional.empty();
        }
        String header = attributes.getRequest().getHeader("X-Test-Actor");
        if (header == null || header.isBlank()) {
            return Optional.empty();
        }
        String[] parts = header.split("\\\\|", -1);
        Long userId = parts.length > 1 && !parts[1].isEmpty() ? Long.valueOf(parts[1]) : null;
        Set<String> permissions = parts.length > 2 && !parts[2].isEmpty()
                ? Arrays.stream(parts[2].split(",")).collect(Collectors.toSet())
                : Set.of();
        return Optional.of(new Actor(parts[0], userId, permissions));
    }
}
`,
);
console.log(`added smoke ActorProvider to ${key}-support`);
