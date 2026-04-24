import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private from!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.transporter = createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.getOrThrow<string>('SMTP_PORT')),
      secure: false,
      ignoreTLS: true,
    });
    this.from = this.config.getOrThrow<string>('SMTP_FROM');
  }

  async onModuleDestroy() {
    this.transporter?.close();
  }

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text });
    this.logger.log(`Email sent to ${to}: ${subject}`);
  }

  async sendTaskAssignmentNotification(assigneeEmail: string, taskTitle: string): Promise<void> {
    await this.sendEmail(
      assigneeEmail,
      'You have been assigned a new task',
      `You have been assigned to task: ${taskTitle}`,
    );
  }
}
