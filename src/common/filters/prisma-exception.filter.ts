import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

type Mapping = { status: number; message: (err: Prisma.PrismaClientKnownRequestError) => string };

const CODE_MAP: Record<string, Mapping> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    message: (e) => `Unique constraint violation on: ${formatTarget(e.meta?.target)}`,
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: (e) => `Foreign key constraint violation on: ${formatTarget(e.meta?.field_name)}`,
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    message: (e) => (typeof e.meta?.cause === 'string' ? e.meta.cause : 'Record not found'),
  },
};

const formatTarget = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return 'unknown';
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter<Prisma.PrismaClientKnownRequestError> {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const mapping = CODE_MAP[exception.code];

    if (!mapping) {
      this.logger.error(
        `Unmapped Prisma error ${exception.code}: ${exception.message}`,
        exception.stack,
      );
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
    }

    const status = mapping.status;
    const message = mapping.message(exception);
    this.logger.warn(`Prisma ${exception.code} → ${status}: ${message}`);

    return res.status(status).json({ statusCode: status, message });
  }
}
