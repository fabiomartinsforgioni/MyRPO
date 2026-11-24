import 'reflect-metadata';
import {
  Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query, UnprocessableEntityException,
} from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { Workspace } from '../src/domain.js';
import type { Collection, Repository, Row, Snapshot } from '../src/domain.js';
import { recordInput } from './input.js';

class MemoryRepository implements Repository {
  private snapshot?: Snapshot;

  load() { return this.snapshot; }
  save(state: Snapshot) { this.snapshot = state; }
}

function resolveCollection(value: string): Collection {
  if (value === 'clientes' || value === 'chamados' || value === 'projetos') return value;
  throw new NotFoundException('Recurso não encontrado.');
}

@Controller('api/v1/health')
class HealthController {
  @Get()
  health() { return { status: 'ok' }; }
}

@Controller('api/v1')
class RecordsController {
  private readonly workspace = new Workspace(new MemoryRepository());

  @Get('workspace')
  snapshot() { return this.workspace.state; }

  @Get(':resource')
  list(@Param('resource') resource: string) {
    return this.workspace.state[resolveCollection(resource)];
  }

  @Get(':resource/:id')
  find(@Param('resource') resource: string, @Param('id') id: string) {
    return this.findRecord(resolveCollection(resource), id);
  }

  @Get(':resource/:id/historico')
  history(@Param('resource') resource: string, @Param('id') id: string) {
    this.findRecord(resolveCollection(resource), id);
    return this.workspace.trail(id);
  }

  @Post(':resource')
  create(@Param('resource') resource: string, @Body() body: unknown, @Query('include') include?: string) {
    const collection = resolveCollection(resource);
    return this.save(collection, recordInput(collection, body, true), include);
  }

  @Patch(':resource/:id')
  update(@Param('resource') resource: string, @Param('id') id: string, @Body() body: unknown, @Query('include') include?: string) {
    const collection = resolveCollection(resource);
    const current = this.findRecord(collection, id);
    return this.save(collection, { ...current, ...recordInput(collection, body, false) }, include);
  }

  private findRecord(collection: Collection, id: string): Row {
    const row = this.workspace.state[collection].find(item => item.id === id);
    if (!row) throw new NotFoundException('Cadastro não encontrado.');
    return row;
  }

  private save(collection: Collection, input: Partial<Row>, include?: string) {
    try {
      const record = this.workspace.save(collection, input);
      return include === 'workspace' ? { record, workspace: this.workspace.state } : record;
    } catch (error) {
      if (error instanceof Error) throw new UnprocessableEntityException(error.message);
      throw error;
    }
  }
}

@Module({ controllers: [HealthController, RecordsController] })
class ApiModule {}

export function createApi(options: NestApplicationOptions = {}) {
  return NestFactory.create(ApiModule, { abortOnError: false, ...options });
}
