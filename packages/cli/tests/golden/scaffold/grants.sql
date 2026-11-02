-- 由 pomaster scaffold generate 生成（模板集 mysql-flyway@1）。受管文件，不要手改：改规格后重新生成。
-- 账号授权脚本：不进 Flyway，由 DBA 按环境执行。${schema} / ${*_host} 是占位符；
-- 账号创建、口令与来源主机由项目按环境决定（凭据管理是项目决策位，不在脚手架里定）。
-- 三个账号最小权限：迁移账号只做结构变更；两个应用账号逐表、按各自部署面暴露的操作授权。

-- 迁移账号（Flyway）
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON `${schema}`.* TO 'fleet_migrator'@'${migrator_host}';

-- 管理侧应用账号（内网）
GRANT SELECT, INSERT, UPDATE, DELETE ON `${schema}`.`vehicle_model` TO 'fleet_admin'@'${admin_host}';

-- 用户侧应用账号（外网）：只授暴露面所需
GRANT SELECT ON `${schema}`.`vehicle_model` TO 'fleet_public'@'${public_host}';
