import './config/env.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import loadEnv from './config/env.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { UsersModule } from './users.module.js';

const withDatabase = Boolean(process.env.DATABASE_URL);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [loadEnv],
    }),
    ...(withDatabase ? [DatabaseModule, UsersModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
