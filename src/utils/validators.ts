/**
 * @module utils/validators
 * @description Funções de validação reutilizáveis para formulários.
 */

export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
	return password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);
}

export function isNotEmpty(value: string): boolean {
	return value.trim().length > 0;
}

export function isValidCpf(cpf: string): boolean {
	const digits = cpf.replace(/\D/g, '');
	if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

	for (let t = 9; t < 11; t++) {
		let sum = 0;
		for (let i = 0; i < t; i++) {
			sum += Number(digits[i]) * (t + 1 - i);
		}
		const remainder = (sum * 10) % 11;
		if ((remainder === 10 ? 0 : remainder) !== Number(digits[t])) return false;
	}

	return true;
}

export function formatCpfInput(value: string): string {
	const digits = value.replace(/\D/g, '').slice(0, 11);
	if (digits.length <= 3) return digits;
	if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
	if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
	return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCnpj(cnpj: string): boolean {
	const digits = cnpj.replace(/\D/g, '');
	if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

	// Dígitos verificadores com pesos cíclicos 2..9.
	const calc = (len: number): number => {
		let sum = 0;
		let peso = len - 7;
		for (let i = 0; i < len; i++) {
			sum += Number(digits[i]) * peso;
			peso = peso === 2 ? 9 : peso - 1;
		}
		const r = sum % 11;
		return r < 2 ? 0 : 11 - r;
	};

	return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

export function formatCnpjInput(value: string): string {
	const d = value.replace(/\D/g, '').slice(0, 14);
	if (d.length <= 2) return d;
	if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
	if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
	if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
	return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
