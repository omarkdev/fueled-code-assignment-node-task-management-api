import * as Joi from 'joi';

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_FROM: string;
}

export const envValidationSchema = Joi.object<AppEnv, true>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).required(),
  SMTP_FROM: Joi.string().email({ tlds: { allow: false } }).required(),
});
