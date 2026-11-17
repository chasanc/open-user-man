import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseKind } from '@oum/domain';
import { createTypeOrmOptions } from './typeorm.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const kind = config.getOrThrow<DatabaseKind>('databaseKind');
        const url = config.getOrThrow<string>('databaseUrl');
        return createTypeOrmOptions({
          kind,
          url,
          poolMax: config.getOrThrow<number>('dbPoolMax'),
          connectTimeoutMs: config.getOrThrow<number>('dbConnectTimeoutMs'),
        });
      },
    }),
  ],
})
export class DatabaseModule {}
