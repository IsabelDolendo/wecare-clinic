import clinic from "@/config/clinic";

export default function AboutClinicPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">About {clinic.name}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-semibold mb-2">Mission & Vision</h3>
          <p className="text-sm text-neutral-600 mb-2">{clinic.mission}</p>
          <p className="text-sm text-neutral-600">{clinic.vision}</p>
        </div>
        <div className="card p-4">
          <h3 className="font-semibold mb-2">Contact</h3>
          <p className="text-sm text-neutral-600">
            <span className="block"><strong>Address:</strong> {clinic.address}</span>
            <span className="block"><strong>Phone:</strong> {clinic.phone}</span>
            <span className="block"><strong>Email:</strong> {clinic.email}</span>
          </p>
        </div>
      </div>
      <div className="aspect-video w-full card overflow-hidden">
        <iframe
          title="WeCare Clinic Map"
          className="w-full h-full"
          src={clinic.mapEmbedUrl}
          loading="lazy"
        />
      </div>
    </div>
  );
}
