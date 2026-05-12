"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center w-fit max-w-full mx-auto",
        caption_label: "text-sm font-semibold text-inherit",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 h-10 w-10 sm:h-7 sm:w-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 bg-transparent p-0 text-inherit opacity-90 hover:opacity-100 touch-manipulation"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 h-10 w-10 sm:h-7 sm:w-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 bg-transparent p-0 text-inherit opacity-90 hover:opacity-100 touch-manipulation"
        ),
        month_grid: "w-full border-collapse table-fixed",
        weekdays: "",
        weekday:
          "text-muted-foreground text-center rounded-md text-[0.8rem] font-normal py-1",
        weeks: "",
        week: "",
        day: "h-11 sm:h-9 text-center text-sm p-0 relative align-middle focus-within:relative focus-within:z-20 [&_button]:mx-auto [&_button]:flex [&_button]:items-center [&_button]:justify-center touch-manipulation",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-11 min-h-[44px] w-11 min-w-[44px] sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0 p-0 font-normal rounded-md text-inherit"
        ),
        range_end: "day-range-end",
        selected:
          "bg-accent text-black font-semibold hover:bg-accent-hover hover:text-black focus:bg-accent focus:text-black rounded-md shadow-sm",
        today: "ring-2 ring-accent/70 ring-inset rounded-md font-medium",
        outside:
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" {...chevronProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
