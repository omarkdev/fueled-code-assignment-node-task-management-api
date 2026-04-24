import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from '../../../../src/common/filters/prisma-exception.filter';

const makeHost = () => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const res = { status, json };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('msg', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  beforeEach(() => {
    filter = new PrismaExceptionFilter();
  });

  it('maps P2002 (unique violation) to 409 with target listed', () => {
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2002', { target: ['email', 'name'] }), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: expect.stringContaining('email, name'),
    });
  });

  it('maps P2003 (foreign key) to 400', () => {
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2003', { field_name: 'userId' }), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: expect.stringContaining('userId'),
    });
  });

  it('maps P2025 (not found) to 404', () => {
    const { host, status, json } = makeHost();
    filter.catch(knownError('P2025', { cause: 'Record to update not found.' }), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Record to update not found.',
    });
  });

  it('falls back to generic 404 message when P2025 has no cause', () => {
    const { host, json } = makeHost();
    filter.catch(knownError('P2025'), host);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Record not found',
    });
  });

  it('returns 500 for unmapped Prisma codes', () => {
    const { host, status, json } = makeHost();
    filter.catch(knownError('P9999'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  });

  it('formats non-array, non-string targets as "unknown"', () => {
    const { host, json } = makeHost();
    filter.catch(knownError('P2002', { target: 42 }), host);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: expect.stringContaining('unknown'),
    });
  });
});
