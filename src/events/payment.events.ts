export class PaymentCompletedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly bookingId: string,
    public readonly payerId: string,
    public readonly receiverId: string,
    public readonly amount: number,
  ) {}
}

export class PaymentFailedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly bookingId: string,
    public readonly payerId: string,
  ) {}
}
