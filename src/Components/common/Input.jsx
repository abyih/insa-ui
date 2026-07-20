import { forwardRef } from "react";

const Input = forwardRef(({ label, error, className = "", ...props }, ref) => {
	return (
		<div className="w-full">
			{label && (
				<label
					htmlFor={props.id || props.name}
					className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5"
				>
					{label}
				</label>
			)}
			<input
				ref={ref}
				className={`w-full px-3.5 py-2.5 bg-zinc-950 border rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 transition-all duration-200
          ${error ? "border-red-500/80" : "border-zinc-800"} ${className}`}
				{...props}
			/>
			{error && <p className="text-xs text-red-400 mt-1.5 font-medium">{error}</p>}
		</div>
	);
});

Input.displayName = "Input";

export default Input;