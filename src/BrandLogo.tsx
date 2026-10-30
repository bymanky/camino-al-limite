export const brandLogos = {
  manky: { file: "by-manky.png", alt: "By Manky" },
  emprende: { file: "emprende-camino.png", alt: "Emprende Camino" },
  fomento: {
    file: "sociedad-fomento-flores.png",
    alt: "Sociedad de Fomento de Flores",
  },
} as const;

export function BrandLogo({
  brand,
  className = "",
}: {
  brand: keyof typeof brandLogos;
  className?: string;
}) {
  const logo = brandLogos[brand];
  return (
    <img
      className={`brand-logo brand-logo-${brand} ${className}`}
      src={`${import.meta.env.BASE_URL}logos/${logo.file}`}
      alt={logo.alt}
      loading="lazy"
      decoding="async"
    />
  );
}
